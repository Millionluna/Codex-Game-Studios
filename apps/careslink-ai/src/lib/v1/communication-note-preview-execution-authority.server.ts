import "server-only";

import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN =
  "careslink.communication-note.preview-authorization" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION =
  "authorization.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN =
  "careslink.communication-note.preview-dispatch-receipt" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION =
  "receipt.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_VERSION =
  "authority.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTION_AUTHORITY_READY =
  false as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_ATTESTATION_READY =
  false as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_OWNER_SIGNING_KEY =
  undefined as CaresLinkV1CommunicationNotePreviewTrustedSigningKey | undefined;
export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RECEIPT_SIGNING_KEY =
  undefined as CaresLinkV1CommunicationNotePreviewTrustedSigningKey | undefined;

const SIGNING_PREFIX = "CARESLINK-V1-ED25519\n" as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]{86}$/;
const MAX_AUTHORIZATION_LIFETIME_MS = 15 * 60 * 1_000;
const MINIMUM_REMAINING_AT_CLAIM_MS = 5 * 60 * 1_000;
const CLOCK_SKEW_MS = 5_000;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS =
  deepFreeze([
    {
      slotIndex: 0,
      fixtureId: "communication.en.phone-duration.v1",
      runOrdinal: 1,
      requestBodySha256:
        "98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213",
      requestBodyUtf8ByteLength: 2_522,
      semanticCanonicalRequestSha256:
        "f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68",
    },
    {
      slotIndex: 1,
      fixtureId: "communication.en.phone-duration.v1",
      runOrdinal: 2,
      requestBodySha256:
        "98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213",
      requestBodyUtf8ByteLength: 2_522,
      semanticCanonicalRequestSha256:
        "f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68",
    },
    {
      slotIndex: 2,
      fixtureId: "communication.zh-hans.mixed-video.v1",
      runOrdinal: 1,
      requestBodySha256:
        "3692fa0e0fd7461829204ddb2767e3cb620aacf0a2c8db20baabd9d62d10d3d6",
      requestBodyUtf8ByteLength: 2_589,
      semanticCanonicalRequestSha256:
        "c83dd32f3aa58625b9cba576c0347e91f8e7ffa57d0c048e28b555ceb1be89b9",
    },
    {
      slotIndex: 3,
      fixtureId: "communication.zh-hans.mixed-video.v1",
      runOrdinal: 2,
      requestBodySha256:
        "3692fa0e0fd7461829204ddb2767e3cb620aacf0a2c8db20baabd9d62d10d3d6",
      requestBodyUtf8ByteLength: 2_589,
      semanticCanonicalRequestSha256:
        "c83dd32f3aa58625b9cba576c0347e91f8e7ffa57d0c048e28b555ceb1be89b9",
    },
    {
      slotIndex: 4,
      fixtureId: "communication.zh-hant.in-person.v1",
      runOrdinal: 1,
      requestBodySha256:
        "0ac00c5037388bd1d8d6d96a28a2d909369d6d75a7d93795d6e86e339da96fc1",
      requestBodyUtf8ByteLength: 2_657,
      semanticCanonicalRequestSha256:
        "5ba1250f04d1eb3ab938ad25270a1444dfe6fa5b706eccab47723687e9cddf76",
    },
    {
      slotIndex: 5,
      fixtureId: "communication.zh-hant.in-person.v1",
      runOrdinal: 2,
      requestBodySha256:
        "0ac00c5037388bd1d8d6d96a28a2d909369d6d75a7d93795d6e86e339da96fc1",
      requestBodyUtf8ByteLength: 2_657,
      semanticCanonicalRequestSha256:
        "5ba1250f04d1eb3ab938ad25270a1444dfe6fa5b706eccab47723687e9cddf76",
    },
  ] as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS =
  deepFreeze({
    requestBodyPinBundleDigest:
      "90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8",
    runnerPolicyDigest:
      "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4",
    evaluationPlanDigest:
      "b89b03ba248bb4c615470a82c7c4ca6220cc009839f9d9c7dd6aaf772fee9dcd",
    requestTemplateDigest:
      "5809bb94ebb96586f5ddb0e48782fa9d961e446a1a5694ac0e18d483f024979d",
    manifestDigest:
      "aab4e65bec64ea2c3dc7da91f3544e91aee3163dc7cab9187765c1eff9581be9",
    goldenFixtureSetDigest:
      "432cfda8c51e76ec517a4c4d39769c3c3a67d7a273ebe3b1662d3e4826449e17",
    workerPolicyDigest:
      "5b91823e2d9e842f2e64e12f9a79610291f9219cd220ec5ac7bea3cd686200f2",
    providerId: "openai.responses",
    modelId: "gpt-5.4-mini-2026-03-17",
    endpointProfile: "OPENAI_AU_STORAGE_RESPONSES_V1",
    endpointUrlSha256:
      "050d015644561df01677bcc29a93369a4bd6cc7bfb6b40a6957e5bb3a819101c",
  } as const);

const AUTHORITY_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_VERSION,
  status: "SOURCE_CONTRACT_ONLY_NO_APPROVED_KEYS_OR_EXECUTION_PATH",
  authorization: {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
    signatureAlgorithm: "Ed25519",
    signatureEncoding: "BASE64URL_NO_PADDING",
    signingPrefix: SIGNING_PREFIX,
    publicKeySource: "EXTERNAL_TRUST_REGISTRY_NOT_ENVELOPE",
    trustedKeyPurpose: "OWNER_AUTHORIZATION",
    trustedKeyScope: "OWNER_AND_TENANT_BOUND_EXTERNAL_SNAPSHOT",
    expectedRunBinding: "CALLER_SUPPLIED_AND_MATCHED",
    maximumLifetimeMs: MAX_AUTHORIZATION_LIFETIME_MS,
    minimumRemainingAtClaimMs: MINIMUM_REMAINING_AT_CLAIM_MS,
    clockSkewMs: CLOCK_SKEW_MS,
  },
  execution: {
    maximumCalls: 6,
    ordering: "SERIAL_SLOT_INDEX_ASCENDING",
    automaticRetry: false,
    claim: "DURABLE_UNIQUE_INSERT_AFTER_PARENT_ROW_LOCK",
    slotReservation: "DURABLE_UNIQUE_INSERT_BEFORE_EXTERNAL_DISPATCH",
    ambiguousOutcome: "SLOT_PERMANENTLY_CONSUMED_NO_RETRY",
    revocation: "APPENDABLE_AFTER_CLAIM_BLOCKS_FUTURE_RESERVATIONS",
    externalTransport: "ABSENT",
  },
  receipt: {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION,
    authenticity: "CARESLINK_SIGNED_INTERNAL_OBSERVATION",
    providerAttestation: "ABSENT",
    transportScope: "APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION",
    notProofOf: [
      "EXACT_PROVIDER_RECEIPT",
      "BILLING",
      "MODEL_EXECUTION",
      "EXACTLY_ONCE",
    ],
    storage: "PRIVATE_FORCE_RLS_APPEND_ONLY",
    exportedDigest: "INTEGRITY_ONLY_SIGNATURE_REQUIRED_FOR_AUTHENTICITY",
    trustedKeyPurpose: "CARESLINK_DISPATCH_RECEIPT",
    reservationBinding: "FULL_CONTENT_FREE_DURABLE_RESERVATION",
    correlationIdentifiers: "PAIRWISE_DISTINCT_HMAC",
    costReconciliation: "FIXED_INTEGER_CEILING_FORMULA",
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
  sourceBindings:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  slots: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  database: {
    schema: "careslink_v1_generation",
    transactionIsolation: "READ_COMMITTED_REQUIRED",
    apiRoles: "NO_USAGE_OR_EXECUTE",
    registrationRole: "careslink_v1_preview_authorization_executor",
    dispatchRole: "careslink_v1_preview_dispatch_executor",
    receiptRole: "careslink_v1_preview_receipt_executor",
  },
} as const);

export type CaresLinkV1CommunicationNotePreviewAuthorityPolicy =
  typeof AUTHORITY_POLICY_CORE & Readonly<{ policyDigest: string }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST =
  "7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9" as const;

if (
  createSha256(AUTHORITY_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST
) {
  throw invalid(
    "Communication Note preview authority policy changed without a reviewed digest pin",
  );
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY =
  deepFreeze({
    ...AUTHORITY_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  }) satisfies CaresLinkV1CommunicationNotePreviewAuthorityPolicy;

type TrustedSigningKeyCore = Readonly<{
  keyId: string;
  publicKeySpkiDerBase64: string;
  publicKeySha256: string;
  status: "ACTIVE";
  notBefore: string;
  expiresAt: string;
}>;

export type CaresLinkV1CommunicationNotePreviewTrustedSigningKey =
  TrustedSigningKeyCore & Readonly<
    | {
      purpose: "OWNER_AUTHORIZATION";
      allowedDomain:
        typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN;
      ownerSubjectHmac: string;
      tenantScopeHmac: string;
    }
    | {
      purpose: "CARESLINK_DISPATCH_RECEIPT";
      allowedDomain:
        typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN;
      ownerSubjectHmac: null;
      tenantScopeHmac: null;
    }
  >;

export type CaresLinkV1CommunicationNotePreviewAuthorizationStatement =
  Readonly<{
    domain: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN;
    version: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION;
    authorizationId: string;
    authorizationNonceHash: string;
    ownerSubjectHmac: string;
    tenantScopeHmac: string;
    runIdHash: string;
    signerKeyIdHash: string;
    signerPublicKeySha256: string;
    issuedAt: string;
    notBefore: string;
    expiresAt: string;
    sourceBindings: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS;
    environmentEvidence: Readonly<{
      openAiProjectIdHmac: string;
      australiaProjectConfigurationSha256: string;
      zeroDataRetentionConfigurationSha256: string;
      modifiedRetentionAmendmentSha256: string;
      ownerProcessingAcknowledgementSha256: string;
      pricingAndModelAvailabilitySha256: string;
      providerSpendLimitSha256: string;
      temporaryCredentialReferenceSha256: string;
    }>;
    budget: Readonly<{
      currency: "USD";
      maximumCalls: 6;
      maximumAttemptsPerSlot: 1;
      automaticRetry: false;
      fallbackModel: null;
      maximumInputTokensPerCall: 10_000;
      maximumOutputTokensPerCall: 2_400;
      maximumProjectedCostMicroUsdPerCall: 20_130;
      projectedCostMicroUsd: 120_780;
      maximumCostMicroUsd: 250_000;
      pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1";
      costNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE";
    }>;
    input: Readonly<{
      classification: "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY";
      realCareDataAllowed: false;
    }>;
    slots: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS;
  }>;

export type CaresLinkV1CommunicationNotePreviewAuthorizationEnvelope =
  Readonly<{
    statement: CaresLinkV1CommunicationNotePreviewAuthorizationStatement;
    signature: string;
  }>;

export type CaresLinkV1VerifiedCommunicationNotePreviewAuthorization =
  Readonly<{
    statement: CaresLinkV1CommunicationNotePreviewAuthorizationStatement;
    authorizationDigest: string;
    signature: string;
    signatureSha256: string;
    authenticity: "EXTERNAL_OWNER_ED25519_VERIFIED";
    verifiedAt: string;
  }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_OUTCOMES =
  deepFreeze([
    "COMPLETED",
    "PROVIDER_HTTP_ERROR",
    "TRANSPORT_AMBIGUOUS",
    "LOCAL_PRE_DISPATCH_ABORTED",
  ] as const);

export type CaresLinkV1CommunicationNotePreviewReceiptOutcome =
  (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_OUTCOMES)[number];

type ReceiptUsage = Readonly<{
  source: "PROVIDER";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number | null;
}>;

export type CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement =
  Readonly<{
    domain: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN;
    version: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION;
    authorizationDigest: string;
    claimId: string;
    runIdHash: string;
    reservationId: string;
    slotIndex: number;
    fixtureId: string;
    runOrdinal: number;
    requestBodySha256: string;
    requestBodyUtf8ByteLength: number;
    semanticCanonicalRequestSha256: string;
    clientRequestIdHmac: string;
    outcome: CaresLinkV1CommunicationNotePreviewReceiptOutcome;
    transport: Readonly<{
      httpStatus: number | null;
      openAiRequestIdHmac: string | null;
      openAiResponseIdHmac: string | null;
    }>;
    usage: ReceiptUsage | null;
    calculatedCostUpperBoundMicroUsd: number | null;
    observedAt: string;
    noRetry: true;
    authenticity: "CARESLINK_SIGNED_INTERNAL_OBSERVATION";
    providerAttestation: "ABSENT";
    transportScope: "APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION";
    notProofOf: readonly [
      "EXACT_PROVIDER_RECEIPT",
      "BILLING",
      "MODEL_EXECUTION",
      "EXACTLY_ONCE",
    ];
    signerKeyIdHash: string;
    signerPublicKeySha256: string;
  }>;

export type CaresLinkV1CommunicationNotePreviewDispatchReceiptEnvelope =
  Readonly<{
    statement: CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement;
    signature: string;
  }>;

export type CaresLinkV1VerifiedCommunicationNotePreviewDispatchReceipt =
  Readonly<{
    statement: CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement;
    receiptDigest: string;
    signature: string;
    signatureSha256: string;
    authenticity: "CARESLINK_ED25519_DISPATCH_OBSERVATION_VERIFIED";
    providerAttestation: "ABSENT";
    verifiedAt: string;
  }>;

export function createCaresLinkV1CommunicationNotePreviewStatementDigest(
  statement: unknown,
) {
  return createSha256(statement);
}

export function createCaresLinkV1CommunicationNotePreviewSigningMessage(
  statement: unknown,
) {
  return Buffer.from(
    `${SIGNING_PREFIX}${stringifyCaresLinkV1CanonicalJson(statement)}`,
    "utf8",
  );
}

/**
 * Test/support validation for public Ed25519 trust metadata. This accepts no
 * private material and does not resolve a key, sign a value or grant execution
 * authority. A production trust or custody boundary remains deliberately
 * absent.
 */
export function validateTestOnlyCaresLinkV1CommunicationNotePreviewTrustedSigningKey(
  value: unknown,
  options: Readonly<{
    now: string;
    expectedPurpose:
      | "OWNER_AUTHORIZATION"
      | "CARESLINK_DISPATCH_RECEIPT";
  }>,
): CaresLinkV1CommunicationNotePreviewTrustedSigningKey {
  try {
    const trustedOptions = requireExactDataObject(
      options,
      ["now", "expectedPurpose"],
      "Trusted signing key options are invalid",
    );
    if (
      trustedOptions.expectedPurpose !== "OWNER_AUTHORIZATION" &&
      trustedOptions.expectedPurpose !== "CARESLINK_DISPATCH_RECEIPT"
    ) {
      throw invalid("Trusted signing key purpose is invalid");
    }
    return validateTrustedKey(
      value,
      requireTimestamp(
        trustedOptions.now,
        "Trusted signing key clock is invalid",
      ),
      trustedOptions.expectedPurpose,
    );
  } catch {
    throw invalid("Trusted signing key is invalid");
  }
}

/**
 * Test/support verifier for a future trust-registry ingress. Supplying a key to
 * this function is not execution authority; the approved key snapshot and every
 * production importer deliberately remain absent.
 */
export function verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
  envelope: unknown,
  options: Readonly<{
    trustedKeySnapshot: unknown;
    now: string;
    expected: Readonly<{
      ownerSubjectHmac: string;
      tenantScopeHmac: string;
      runIdHash: string;
    }>;
  }>,
): CaresLinkV1VerifiedCommunicationNotePreviewAuthorization {
  const now = requireTimestamp(options.now, "Authorization clock is invalid");
  const statement = validateAuthorizationStatement(
    requireEnvelope(envelope, "Authorization envelope is invalid").statement,
    now,
  );
  const signature = requireEd25519Signature(
    requireEnvelope(envelope, "Authorization envelope is invalid").signature,
  );
  const expected = options.expected;
  for (const digest of [
    expected.ownerSubjectHmac,
    expected.tenantScopeHmac,
    expected.runIdHash,
  ]) {
    requireSha256(digest, "Authorization expected binding is invalid");
  }
  if (
    statement.ownerSubjectHmac !== expected.ownerSubjectHmac ||
    statement.tenantScopeHmac !== expected.tenantScopeHmac ||
    statement.runIdHash !== expected.runIdHash
  ) {
    throw invalid("Authorization does not match its trusted execution scope");
  }
  const trustedKey = validateTrustedKey(
    options.trustedKeySnapshot,
    now,
    "OWNER_AUTHORIZATION",
  );
  verifyEnvelopeSignature(statement, signature, trustedKey, now);
  return deepFreeze({
    statement,
    authorizationDigest: createSha256(statement),
    signature,
    signatureSha256: createTextSha256(signature),
    authenticity: "EXTERNAL_OWNER_ED25519_VERIFIED" as const,
    verifiedAt: new Date(now).toISOString(),
  });
}

/**
 * Verifies a CaresLink receipt signer. It authenticates CaresLink's observation,
 * not OpenAI: x-request-id and response.id are opaque correlation identifiers,
 * not provider signatures.
 */
export function verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
  envelope: unknown,
  options: Readonly<{
    trustedKeySnapshot: unknown;
    now: string;
    expected: Readonly<{
      authorizationDigest: string;
      claimId: string;
      runIdHash: string;
      reservationId: string;
      slotIndex: number;
      fixtureId: string;
      runOrdinal: number;
      requestBodySha256: string;
      requestBodyUtf8ByteLength: number;
      semanticCanonicalRequestSha256: string;
      clientRequestIdHmac: string;
      reservedAt: string;
    }>;
  }>,
): CaresLinkV1VerifiedCommunicationNotePreviewDispatchReceipt {
  const now = requireTimestamp(options.now, "Receipt clock is invalid");
  const object = requireEnvelope(envelope, "Dispatch receipt is invalid");
  const statement = validateReceiptStatement(object.statement, now);
  const signature = requireEd25519Signature(object.signature);
  const expected = options.expected;
  for (const digest of [
    expected.authorizationDigest,
    expected.runIdHash,
    expected.clientRequestIdHmac,
    expected.requestBodySha256,
    expected.semanticCanonicalRequestSha256,
  ]) {
    requireSha256(digest, "Receipt expected binding is invalid");
  }
  for (const id of [expected.claimId, expected.reservationId]) {
    requireUuid(id, "Receipt expected binding is invalid");
  }
  const reservedAt = requireTimestamp(
    expected.reservedAt,
    "Receipt expected reservation time is invalid",
  );
  if (
    !Number.isSafeInteger(expected.slotIndex) ||
    !Number.isSafeInteger(expected.runOrdinal) ||
    !Number.isSafeInteger(expected.requestBodyUtf8ByteLength) ||
    typeof expected.fixtureId !== "string" ||
    expected.fixtureId.length === 0
  ) {
    throw invalid("Receipt expected binding is invalid");
  }
  if (
    statement.authorizationDigest !== expected.authorizationDigest ||
    statement.claimId !== expected.claimId ||
    statement.runIdHash !== expected.runIdHash ||
    statement.reservationId !== expected.reservationId ||
    statement.slotIndex !== expected.slotIndex ||
    statement.fixtureId !== expected.fixtureId ||
    statement.runOrdinal !== expected.runOrdinal ||
    statement.requestBodySha256 !== expected.requestBodySha256 ||
    statement.requestBodyUtf8ByteLength !==
      expected.requestBodyUtf8ByteLength ||
    statement.semanticCanonicalRequestSha256 !==
      expected.semanticCanonicalRequestSha256 ||
    statement.clientRequestIdHmac !== expected.clientRequestIdHmac ||
    Date.parse(statement.observedAt) < reservedAt
  ) {
    throw invalid("Dispatch receipt does not match its durable reservation");
  }
  const trustedKey = validateTrustedKey(
    options.trustedKeySnapshot,
    now,
    "CARESLINK_DISPATCH_RECEIPT",
  );
  verifyEnvelopeSignature(statement, signature, trustedKey, now);
  return deepFreeze({
    statement,
    receiptDigest: createSha256(statement),
    signature,
    signatureSha256: createTextSha256(signature),
    authenticity:
      "CARESLINK_ED25519_DISPATCH_OBSERVATION_VERIFIED" as const,
    providerAttestation:
      "ABSENT" as const,
    verifiedAt: new Date(now).toISOString(),
  });
}

function validateAuthorizationStatement(
  value: unknown,
  now: number,
): CaresLinkV1CommunicationNotePreviewAuthorizationStatement {
  const object = requireObject(value, "Authorization statement is invalid");
  assertExactKeys(object, [
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
  ], "Authorization statement is invalid");
  if (
    object.domain !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN ||
    object.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION
  ) {
    throw invalid("Authorization statement is invalid");
  }
  const authorizationId = requireUuid(
    object.authorizationId,
    "Authorization identifier is invalid",
  );
  const authorizationNonceHash = requireSha256(
    object.authorizationNonceHash,
    "Authorization nonce hash is invalid",
  );
  const ownerSubjectHmac = requireSha256(
    object.ownerSubjectHmac,
    "Authorization owner hash is invalid",
  );
  const tenantScopeHmac = requireSha256(
    object.tenantScopeHmac,
    "Authorization tenant binding is invalid",
  );
  const runIdHash = requireSha256(
    object.runIdHash,
    "Authorization run binding is invalid",
  );
  const signerKeyIdHash = requireSha256(
    object.signerKeyIdHash,
    "Authorization signer key hash is invalid",
  );
  const signerPublicKeySha256 = requireSha256(
    object.signerPublicKeySha256,
    "Authorization signer fingerprint is invalid",
  );
  const issuedAt = requireTimestamp(
    object.issuedAt,
    "Authorization issued time is invalid",
  );
  const notBefore = requireTimestamp(
    object.notBefore,
    "Authorization start time is invalid",
  );
  const expiresAt = requireTimestamp(
    object.expiresAt,
    "Authorization expiry is invalid",
  );
  if (
    notBefore < issuedAt ||
    expiresAt <= notBefore ||
    expiresAt - issuedAt > MAX_AUTHORIZATION_LIFETIME_MS ||
    issuedAt > now + CLOCK_SKEW_MS ||
    notBefore > now + CLOCK_SKEW_MS ||
    expiresAt <= now
  ) {
    throw invalid("Authorization time window is invalid");
  }
  if (!canonicalEqual(object.sourceBindings,
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS)) {
    throw invalid("Authorization source binding is invalid");
  }
  const environmentEvidence = validateEnvironmentEvidence(
    object.environmentEvidence,
  );
  const budget = validateAuthorizationBudget(object.budget);
  const input = validateAuthorizationInput(object.input);
  if (!canonicalEqual(object.slots,
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS)) {
    throw invalid("Authorization slots are invalid");
  }
  return deepFreeze({
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
    authorizationId,
    authorizationNonceHash,
    ownerSubjectHmac,
    tenantScopeHmac,
    runIdHash,
    signerKeyIdHash,
    signerPublicKeySha256,
    issuedAt: new Date(issuedAt).toISOString(),
    notBefore: new Date(notBefore).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    sourceBindings:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
    environmentEvidence,
    budget,
    input,
    slots: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  });
}

function validateEnvironmentEvidence(value: unknown) {
  const object = requireObject(value, "Authorization evidence is invalid");
  const keys = [
    "openAiProjectIdHmac",
    "australiaProjectConfigurationSha256",
    "zeroDataRetentionConfigurationSha256",
    "modifiedRetentionAmendmentSha256",
    "ownerProcessingAcknowledgementSha256",
    "pricingAndModelAvailabilitySha256",
    "providerSpendLimitSha256",
    "temporaryCredentialReferenceSha256",
  ] as const;
  assertExactKeys(object, keys, "Authorization evidence is invalid");
  const result: Record<(typeof keys)[number], string> = {} as Record<
    (typeof keys)[number],
    string
  >;
  for (const key of keys) {
    result[key] = requireSha256(
      object[key],
      "Authorization evidence is invalid",
    );
  }
  return deepFreeze(result);
}

function validateAuthorizationBudget(value: unknown) {
  const object = requireObject(value, "Authorization budget is invalid");
  assertExactKeys(object, [
    "currency",
    "maximumCalls",
    "maximumAttemptsPerSlot",
    "automaticRetry",
    "fallbackModel",
    "maximumInputTokensPerCall",
    "maximumOutputTokensPerCall",
    "maximumProjectedCostMicroUsdPerCall",
    "projectedCostMicroUsd",
    "maximumCostMicroUsd",
    "pricingVersion",
    "costNature",
  ], "Authorization budget is invalid");
  if (
    object.currency !== "USD" ||
    object.maximumCalls !== 6 ||
    object.maximumAttemptsPerSlot !== 1 ||
    object.automaticRetry !== false ||
    object.fallbackModel !== null ||
    object.maximumInputTokensPerCall !== 10_000 ||
    object.maximumOutputTokensPerCall !== 2_400 ||
    object.maximumProjectedCostMicroUsdPerCall !== 20_130 ||
    object.projectedCostMicroUsd !== 120_780 ||
    object.maximumCostMicroUsd !== 250_000 ||
    object.pricingVersion !== "openai.gpt-5.4-mini.au.2026-08-27.v1" ||
    object.costNature !== "CALCULATED_UPPER_BOUND_NOT_INVOICE"
  ) {
    throw invalid("Authorization budget is invalid");
  }
  return AUTHORITY_POLICY_CORE.budget;
}

function validateAuthorizationInput(value: unknown) {
  const object = requireObject(value, "Authorization input class is invalid");
  assertExactKeys(object, ["classification", "realCareDataAllowed"],
    "Authorization input class is invalid");
  if (
    object.classification !==
      "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY" ||
    object.realCareDataAllowed !== false
  ) {
    throw invalid("Authorization input class is invalid");
  }
  return AUTHORITY_POLICY_CORE.input;
}

function validateReceiptStatement(
  value: unknown,
  now: number,
): CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement {
  const object = requireObject(value, "Dispatch receipt statement is invalid");
  assertExactKeys(object, [
    "domain",
    "version",
    "authorizationDigest",
    "claimId",
    "runIdHash",
    "reservationId",
    "slotIndex",
    "fixtureId",
    "runOrdinal",
    "requestBodySha256",
    "requestBodyUtf8ByteLength",
    "semanticCanonicalRequestSha256",
    "clientRequestIdHmac",
    "outcome",
    "transport",
    "usage",
    "calculatedCostUpperBoundMicroUsd",
    "observedAt",
    "noRetry",
    "authenticity",
    "providerAttestation",
    "transportScope",
    "notProofOf",
    "signerKeyIdHash",
    "signerPublicKeySha256",
  ], "Dispatch receipt statement is invalid");
  if (
    object.domain !== CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN ||
    object.version !== CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION ||
    object.noRetry !== true ||
    object.authenticity !== "CARESLINK_SIGNED_INTERNAL_OBSERVATION" ||
    object.providerAttestation !== "ABSENT" ||
    object.transportScope !==
      "APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION" ||
    !canonicalEqual(object.notProofOf, AUTHORITY_POLICY_CORE.receipt.notProofOf)
  ) {
    throw invalid("Dispatch receipt statement is invalid");
  }
  const slotIndex = requireInteger(object.slotIndex,
    "Dispatch receipt slot is invalid");
  const slot = CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS[slotIndex];
  if (
    !slot ||
    object.fixtureId !== slot.fixtureId ||
    object.runOrdinal !== slot.runOrdinal ||
    object.requestBodySha256 !== slot.requestBodySha256 ||
    object.requestBodyUtf8ByteLength !== slot.requestBodyUtf8ByteLength ||
    object.semanticCanonicalRequestSha256 !==
      slot.semanticCanonicalRequestSha256
  ) {
    throw invalid("Dispatch receipt slot is invalid");
  }
  const outcome = object.outcome;
  if (!(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_OUTCOMES as readonly unknown[])
    .includes(outcome)) {
    throw invalid("Dispatch receipt outcome is invalid");
  }
  const clientRequestIdHmac = requireSha256(
    object.clientRequestIdHmac,
    "Dispatch receipt client request binding is invalid",
  );
  const transport = validateTransport(
    object.transport,
    outcome as CaresLinkV1CommunicationNotePreviewReceiptOutcome,
    clientRequestIdHmac,
  );
  const usage = validateReceiptUsage(object.usage, outcome as
    CaresLinkV1CommunicationNotePreviewReceiptOutcome);
  const calculatedCostUpperBoundMicroUsd =
    validateReceiptCost(
      object.calculatedCostUpperBoundMicroUsd,
      outcome as CaresLinkV1CommunicationNotePreviewReceiptOutcome,
      usage,
    );
  const observedAt = requireTimestamp(
    object.observedAt,
    "Dispatch receipt observation time is invalid",
  );
  if (observedAt > now + CLOCK_SKEW_MS) {
    throw invalid("Dispatch receipt observation time is invalid");
  }
  return deepFreeze({
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION,
    authorizationDigest: requireSha256(object.authorizationDigest,
      "Dispatch receipt authorization binding is invalid"),
    claimId: requireUuid(object.claimId,
      "Dispatch receipt claim binding is invalid"),
    runIdHash: requireSha256(object.runIdHash,
      "Dispatch receipt run binding is invalid"),
    reservationId: requireUuid(object.reservationId,
      "Dispatch receipt reservation binding is invalid"),
    slotIndex,
    fixtureId: slot.fixtureId,
    runOrdinal: slot.runOrdinal,
    requestBodySha256: slot.requestBodySha256,
    requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
    semanticCanonicalRequestSha256:
      slot.semanticCanonicalRequestSha256,
    clientRequestIdHmac,
    outcome: outcome as CaresLinkV1CommunicationNotePreviewReceiptOutcome,
    transport,
    usage,
    calculatedCostUpperBoundMicroUsd,
    observedAt: new Date(observedAt).toISOString(),
    noRetry: true,
    authenticity: "CARESLINK_SIGNED_INTERNAL_OBSERVATION",
    providerAttestation: "ABSENT",
    transportScope: "APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION",
    notProofOf: AUTHORITY_POLICY_CORE.receipt.notProofOf,
    signerKeyIdHash: requireSha256(object.signerKeyIdHash,
      "Dispatch receipt signer binding is invalid"),
    signerPublicKeySha256: requireSha256(object.signerPublicKeySha256,
      "Dispatch receipt signer binding is invalid"),
  });
}

function validateTransport(
  value: unknown,
  outcome: CaresLinkV1CommunicationNotePreviewReceiptOutcome,
  clientRequestIdHmac: string,
) {
  const object = requireObject(value, "Dispatch receipt transport is invalid");
  assertExactKeys(object, [
    "httpStatus",
    "openAiRequestIdHmac",
    "openAiResponseIdHmac",
  ], "Dispatch receipt transport is invalid");
  const httpStatus = object.httpStatus === null
    ? null
    : requireInteger(object.httpStatus,
      "Dispatch receipt HTTP status is invalid");
  const openAiRequestIdHmac = object.openAiRequestIdHmac === null
    ? null
    : requireSha256(object.openAiRequestIdHmac,
      "Dispatch receipt OpenAI request ID hash is invalid");
  const openAiResponseIdHmac = object.openAiResponseIdHmac === null
    ? null
    : requireSha256(object.openAiResponseIdHmac,
      "Dispatch receipt OpenAI response ID hash is invalid");
  const observedCorrelationIds = [
    clientRequestIdHmac,
    openAiRequestIdHmac,
    openAiResponseIdHmac,
  ].filter((value): value is string => value !== null);
  if (new Set(observedCorrelationIds).size !== observedCorrelationIds.length) {
    throw invalid("Dispatch receipt transport identifiers are invalid");
  }
  const valid =
    (outcome === "COMPLETED" &&
      httpStatus !== null && httpStatus >= 200 && httpStatus <= 299 &&
      openAiRequestIdHmac !== null && openAiResponseIdHmac !== null) ||
    (outcome === "PROVIDER_HTTP_ERROR" &&
      httpStatus !== null && httpStatus >= 400 && httpStatus <= 599 &&
      openAiResponseIdHmac === null) ||
    (outcome === "TRANSPORT_AMBIGUOUS" &&
      (httpStatus === null || (httpStatus >= 100 && httpStatus <= 599))) ||
    (outcome === "LOCAL_PRE_DISPATCH_ABORTED" &&
      httpStatus === null && openAiRequestIdHmac === null &&
      openAiResponseIdHmac === null);
  if (!valid) throw invalid("Dispatch receipt transport is invalid");
  return deepFreeze({ httpStatus, openAiRequestIdHmac, openAiResponseIdHmac });
}

function validateReceiptUsage(
  value: unknown,
  outcome: CaresLinkV1CommunicationNotePreviewReceiptOutcome,
): ReceiptUsage | null {
  if (outcome !== "COMPLETED") {
    if (value !== null) throw invalid("Dispatch receipt usage is invalid");
    return null;
  }
  const object = requireObject(value, "Dispatch receipt usage is invalid");
  assertExactKeys(object, [
    "source",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "cachedInputTokens",
    "reasoningTokens",
  ], "Dispatch receipt usage is invalid");
  const inputTokens = requireNonNegativeInteger(object.inputTokens,
    "Dispatch receipt usage is invalid");
  const outputTokens = requireNonNegativeInteger(object.outputTokens,
    "Dispatch receipt usage is invalid");
  const totalTokens = requireNonNegativeInteger(object.totalTokens,
    "Dispatch receipt usage is invalid");
  const cachedInputTokens = requireNonNegativeInteger(object.cachedInputTokens,
    "Dispatch receipt usage is invalid");
  const reasoningTokens = object.reasoningTokens === null
    ? null
    : requireNonNegativeInteger(object.reasoningTokens,
      "Dispatch receipt usage is invalid");
  if (
    object.source !== "PROVIDER" ||
    inputTokens < 1 || outputTokens < 1 ||
    totalTokens !== inputTokens + outputTokens ||
    inputTokens > 10_000 || outputTokens > 2_400 ||
    cachedInputTokens > inputTokens ||
    (reasoningTokens !== null && reasoningTokens > outputTokens)
  ) {
    throw invalid("Dispatch receipt usage is invalid");
  }
  return deepFreeze({
    source: "PROVIDER" as const,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
  });
}

function validateReceiptCost(
  value: unknown,
  outcome: CaresLinkV1CommunicationNotePreviewReceiptOutcome,
  usage: ReceiptUsage | null,
) {
  if (outcome !== "COMPLETED") {
    if (outcome === "LOCAL_PRE_DISPATCH_ABORTED" && value === 0) return 0;
    if (value !== null) throw invalid("Dispatch receipt cost is invalid");
    return null;
  }
  const cost = requireNonNegativeInteger(value,
    "Dispatch receipt cost is invalid");
  if (
    usage === null ||
    cost !== calculateReceiptCostMicroUsd(usage) ||
    cost > 20_130
  ) {
    throw invalid("Dispatch receipt cost is invalid");
  }
  return cost;
}

function calculateReceiptCostMicroUsd(usage: ReceiptUsage) {
  const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
  const numerator = (
    uncachedInputTokens * 750_000 +
    usage.cachedInputTokens * 75_000 +
    usage.outputTokens * 4_500_000
  ) * 11_000;
  if (!Number.isSafeInteger(numerator)) {
    throw invalid("Dispatch receipt cost is invalid");
  }
  return Math.ceil(numerator / 10_000_000_000);
}

function validateTrustedKey(
  value: unknown,
  now: number,
  expectedPurpose:
    | "OWNER_AUTHORIZATION"
    | "CARESLINK_DISPATCH_RECEIPT",
) {
  const object = requireExactDataObject(
    value,
    [
      "keyId",
      "publicKeySpkiDerBase64",
      "publicKeySha256",
      "status",
      "notBefore",
      "expiresAt",
      "purpose",
      "allowedDomain",
      "ownerSubjectHmac",
      "tenantScopeHmac",
    ],
    "Trusted signing key is invalid",
  );
  if (
    typeof object.keyId !== "string" ||
    !IDENTIFIER_PATTERN.test(object.keyId) ||
    typeof object.publicKeySpkiDerBase64 !== "string" ||
    !BASE64_PATTERN.test(object.publicKeySpkiDerBase64) ||
    object.status !== "ACTIVE" ||
    object.purpose !== expectedPurpose
  ) {
    throw invalid("Trusted signing key is invalid");
  }
  const keyBytes = decodeCanonicalBase64(object.publicKeySpkiDerBase64);
  const publicKeySha256 = requireSha256(
    object.publicKeySha256,
    "Trusted signing key is invalid",
  );
  if (createBufferSha256(keyBytes) !== publicKeySha256) {
    throw invalid("Trusted signing key fingerprint does not match");
  }
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: keyBytes,
      format: "der",
      type: "spki",
    });
  } catch {
    throw invalid("Trusted Ed25519 public key is invalid");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw invalid("Trusted Ed25519 public key is invalid");
  }
  const notBefore = requireTimestamp(
    object.notBefore,
    "Trusted signing key time window is invalid",
  );
  const expiresAt = requireTimestamp(
    object.expiresAt,
    "Trusted signing key time window is invalid",
  );
  if (expiresAt <= notBefore || now < notBefore || now >= expiresAt) {
    throw invalid("Trusted signing key is not active");
  }
  if (expectedPurpose === "OWNER_AUTHORIZATION") {
    if (
      object.allowedDomain !==
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN ||
      typeof object.ownerSubjectHmac !== "string" ||
      !SHA256_PATTERN.test(object.ownerSubjectHmac) ||
      typeof object.tenantScopeHmac !== "string" ||
      !SHA256_PATTERN.test(object.tenantScopeHmac)
    ) {
      throw invalid("Trusted owner signing key scope is invalid");
    }
    return deepFreeze({
      keyId: object.keyId,
      publicKeySpkiDerBase64: object.publicKeySpkiDerBase64,
      publicKeySha256,
      status: "ACTIVE" as const,
      notBefore: new Date(notBefore).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      purpose: "OWNER_AUTHORIZATION" as const,
      allowedDomain:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
      ownerSubjectHmac: object.ownerSubjectHmac,
      tenantScopeHmac: object.tenantScopeHmac,
    });
  }
  if (
    object.allowedDomain !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN ||
    object.ownerSubjectHmac !== null ||
    object.tenantScopeHmac !== null
  ) {
    throw invalid("Trusted receipt signing key scope is invalid");
  }
  return deepFreeze({
    keyId: object.keyId,
    publicKeySpkiDerBase64: object.publicKeySpkiDerBase64,
    publicKeySha256,
    status: "ACTIVE" as const,
    notBefore: new Date(notBefore).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    purpose: "CARESLINK_DISPATCH_RECEIPT" as const,
    allowedDomain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
    ownerSubjectHmac: null,
    tenantScopeHmac: null,
  });
}

function verifyEnvelopeSignature(
  statement: CaresLinkV1CommunicationNotePreviewAuthorizationStatement |
    CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement,
  signature: string,
  trustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  now: number,
) {
  const signatureBytes = decodeCanonicalBase64Url(signature);
  if (signatureBytes.length !== 64) throw invalid("Ed25519 signature is invalid");
  if (
    statement.signerKeyIdHash !== createTextSha256(trustedKey.keyId) ||
    statement.signerPublicKeySha256 !== trustedKey.publicKeySha256 ||
    statement.domain !== trustedKey.allowedDomain ||
    ("ownerSubjectHmac" in statement &&
      (trustedKey.purpose !== "OWNER_AUTHORIZATION" ||
        statement.ownerSubjectHmac !== trustedKey.ownerSubjectHmac ||
        statement.tenantScopeHmac !== trustedKey.tenantScopeHmac)) ||
    (!("ownerSubjectHmac" in statement) &&
      trustedKey.purpose !== "CARESLINK_DISPATCH_RECEIPT")
  ) {
    throw invalid("Signing key does not match the signed statement");
  }
  const statementIssuedAt = "issuedAt" in statement
    ? requireTimestamp(statement.issuedAt, "Signed statement time is invalid")
    : requireTimestamp(statement.observedAt, "Signed statement time is invalid");
  if (
    statementIssuedAt < requireTimestamp(trustedKey.notBefore,
      "Trusted signing key time window is invalid") ||
    statementIssuedAt >= requireTimestamp(trustedKey.expiresAt,
      "Trusted signing key time window is invalid") ||
    statementIssuedAt > now + CLOCK_SKEW_MS
  ) {
    throw invalid("Signing key was not valid for the signed statement");
  }
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: decodeCanonicalBase64(trustedKey.publicKeySpkiDerBase64),
      format: "der",
      type: "spki",
    });
  } catch {
    throw invalid("Trusted Ed25519 public key is invalid");
  }
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    !verifySignature(
      null,
      createCaresLinkV1CommunicationNotePreviewSigningMessage(statement),
      publicKey,
      signatureBytes,
    )
  ) {
    throw invalid("Signed statement authenticity check failed");
  }
}

function requireEd25519Signature(value: unknown) {
  if (typeof value !== "string" || !BASE64URL_PATTERN.test(value)) {
    throw invalid("Ed25519 signature is invalid");
  }
  const bytes = decodeCanonicalBase64Url(value);
  if (bytes.length !== 64) throw invalid("Ed25519 signature is invalid");
  return value;
}

function requireEnvelope(value: unknown, message: string) {
  const object = requireObject(value, message);
  assertExactKeys(object, ["statement", "signature"], message);
  return object;
}

function requireObject(value: unknown, message: string) {
  if (!isPlainObject(value)) throw invalid(message);
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  object: Record<string, unknown>,
  expected: readonly string[],
  message: string,
) {
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])) {
    throw invalid(message);
  }
}

function requireExactDataObject<const Key extends string>(
  value: unknown,
  expected: readonly Key[],
  message: string,
): Record<Key, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw invalid(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw invalid(message);
  }
  const names = Object.getOwnPropertyNames(value).sort();
  const wanted = [...expected].sort();
  if (
    names.length !== wanted.length ||
    names.some((name, index) => name !== wanted[index])
  ) {
    throw invalid(message);
  }
  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw invalid(message);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function requireSha256(value: unknown, message: string) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw invalid(message);
  }
  return value;
}

function requireUuid(value: unknown, message: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw invalid(message);
  }
  return value;
}

function requireTimestamp(value: unknown, message: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw invalid(message);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw invalid(message);
  }
  return timestamp;
}

function requireInteger(value: unknown, message: string) {
  if (!Number.isSafeInteger(value)) throw invalid(message);
  return value as number;
}

function requireNonNegativeInteger(value: unknown, message: string) {
  const integer = requireInteger(value, message);
  if (integer < 0) throw invalid(message);
  return integer;
}

function decodeCanonicalBase64(value: string) {
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw invalid("Base64 value is not canonical");
  }
  return bytes;
}

function decodeCanonicalBase64Url(value: string) {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) {
    throw invalid("Base64url value is not canonical");
  }
  return bytes;
}

function canonicalEqual(left: unknown, right: unknown) {
  try {
    return stringifyCaresLinkV1CanonicalJson(left) ===
      stringifyCaresLinkV1CanonicalJson(right);
  } catch {
    return false;
  }
}

function createSha256(value: unknown) {
  return createTextSha256(stringifyCaresLinkV1CanonicalJson(value));
}

function createTextSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function createBufferSha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
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

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}
